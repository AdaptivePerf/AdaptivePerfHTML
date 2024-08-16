#include "tree_parse.hpp"

int main() {
    std::ifstream file("data2.json"); //this is only for test
    json j;
    file >> j;

    u_int16_t start_time = 0;

    if(j.contains("first_time")){
         if (j["first_time"].is_number_unsigned()) {
            start_time = j["first_time"].get<uint64_t>();
        } else if (j["first_time"].is_number_integer()) {
            start_time = static_cast<uint64_t>(j["first_time"].get<int64_t>());
        }
    }

    if (j.contains("walltime") && j["walltime"].size() > 1) {
        TreeNode second_node = parse_json_to_tree(j["walltime"][1]); //time ordered json

        uint64_t running_sum = 0;
        calculate_left_sum(second_node, running_sum);

       
        uint64_t threshold_left = 100000000; // - start_time if needed
        uint64_t threshold_right = 8000000000; // - start_time if needed

        TreeNode pruned_tree = prune_tree(second_node, threshold_left, threshold_right);

        json pruned_tree_json = tree_to_json(pruned_tree);
        save_json_to_file(pruned_tree_json, "pruned_tree.json");

        std::cout << "\nPruned Tree :\n"; //tree that only includes nodes which overlap with the time period between with two thresholds
        print_tree(pruned_tree);

    } else {
        std::cerr << "The walltime array does not have at least two elements." << std::endl;
    }

    return 0;
}
