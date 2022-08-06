import { List } from "@raycast/api";
import { Language, sourceLanguages, useTranslation, useUsage } from "./deepl-api";
import { useEffect, useState } from "react";
import TranslationResultListItem from "./components/TranslationResultListItem";
import SourceLanguageDropdown from "./components/SourceLanguageDropdown";

export default function Command(targetLanguage: Language): () => JSX.Element {
  return () => {
    const [searchText, setSearchText] = useState("");
    const [sourceLanguage, setSourceLanguage] = useState<Language | undefined>(undefined);
    const { isLoading: isLoadingTranslation, data: translation } = useTranslation(
      searchText,
      sourceLanguage,
      targetLanguage
    );
    const { isLoading: isLoadingUsage, data: usage, revalidate: revalidateUsage } = useUsage();
    const isLoading = isLoadingUsage || isLoadingTranslation;
    const hasInput = searchText.length > 0;
    const hasTranslation = translation !== undefined;

    useEffect(() => revalidateUsage(), [translation]);

    return (
      <List
        isLoading={isLoading && hasInput}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        searchBarPlaceholder={`Translate to ${targetLanguage.name} using DeepL…`}
        searchBarAccessory={
          <SourceLanguageDropdown sourceLanguages={sourceLanguages} onSourceLanguageChange={setSourceLanguage} />
        }
        throttle
      >
        {hasTranslation && <TranslationResultListItem translation={translation} usage={usage} />}
      </List>
    );
  };
}
